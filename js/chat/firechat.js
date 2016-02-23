import Firebase from 'firebase';

export default class Firechat {
    constructor(appId, options) {
        this._firebase = typeof appId !== 'string' ?
            new Firebase(appId || 'https://amber-inferno-4139.firebaseio.com/') :
            appId;

        // User-specific instance variables.
        this._user = null;
        this._userId = null;
        this._userName = null;
        this._isModerator = false;

        // A unique id generated for each session.
        this._sessionId = null;

        // A mapping of event IDs to an array of callbacks.
        this._events = {};

        // A mapping of room IDs to a boolean indicating presence.
        this._rooms = {};

        // A mapping of operations to re-queue on disconnect.
        this._presenceBits = {};

        // Commonly-used Firebase references.
        this._userRef = null;
        this._messageRef = this._firebase.child('room-messages');
        this._roomRef = this._firebase.child('room-metadata');
        this._privateRoomRef = this._firebase.child('room-private-metadata');
        this._moderatorsRef = this._firebase.child('moderators');
        this._suspensionsRef = this._firebase.child('suspensions');
        this._usersOnlineRef = this._firebase.child('user-names-online');

        // Setup and establish default options.
        this._options = options || {};

        // The number of historical messages to load per room.
        this._options.numMaxMessages = this._options.numMaxMessages || 50;
    }

    /**
     * Initialize the library and setup data listeners.
     *
     * @param userId
     * @param userName
     * @param callback
     */
    setUser(userId, userName, callback) {
        this._firebase.onAuth((authData) => {
            if (authData) {
                this._userId = userId.toString();
                this._userName = userName.toString();
                this._userRef = this._firebase.child('users').child(this._userId);
                this._loadUserMetadata(() => {
                    setTimeout(() => {
                        callback(this._user);
                        this._setupDataEvents();
                    }, 0);
                });
            } else {
                this.warn('Firechat requires an authenticated Firebase reference. ' +
                    'Pass an authenticated reference before loading.');
            }
        });
    }

    /**
     * Automatically re-enters any chat rooms that the user was previously in, if the user has history saved.
     */
    resumeSession() {
        return this._userRef.child('rooms').once('value').then((snapshot) => {
            const rooms = snapshot.val();

            for (var roomId in rooms) {
                this.enterRoom(rooms[roomId].id);
            }

            return rooms;
        });
    }

    /**
     * Sets up a binding for the specified event type (string), for which the callback will be invoked.
     * See API - Exposed Bindings for more information.
     *
     * - user-update - Invoked when the user's metadata changes.
     * - room-enter - Invoked when the user successfully enters a room.
     * - room-exit - Invoked when the user exists a room.
     * - message-add - Invoked when a new message is received.
     * - message-remove - Invoked when a message is deleted.
     * - room-invite - Invoked when a new room invite is received.
     * - room-invite-response - Invoked when a response to a previous invite is received.
     *
     * @param {String} eventType
     * @param {Function} cb
     */
    on(eventType: String, cb: Function) {
        this._addEventCallback(eventType, cb);

        return this;
    }
    /**
     * Creates a new room with the given name (string) and type (string - public or private) and
     * invokes the callback with the room ID on completion.
     *
     * @param {String} roomName
     * @param {String} roomType
     * @returns {Promise.<{id: String}>}
     */
    @requireAuth
    createRoom(roomName: String, roomType: String) {
        const newRoomRef = this._roomRef.push();
        const newRoom = {
            id: newRoomRef.key(),
            name: roomName,
            type: roomType || 'public',
            createdByUserId: this._userId,
            createdAt: Firebase.ServerValue.TIMESTAMP
        };

        if (roomType === 'private') {
            newRoom.authorizedUsers = {};
            newRoom.authorizedUsers[this._userId] = true;
        }

        return newRoomRef.set(newRoom).then(() => {
            this.enterRoom(newRoom.id);

            return {id: newRoom.id};
        });
    }

    /**
     * Enters the chat room with the specified id.
     * On success, all methods bound to the room-enter event will be invoked.
     *
     * @param {String} roomId
     */
    @requireAuth
    enterRoom(roomId: String) {
        this.getRoom(roomId).then((room) => {
            const roomName = room.name;

            if (!roomId || !roomName) {
                return;
            }

            // Skip if we're already in this room.
            if (this._rooms[roomId]) {
                return;
            }

            this._rooms[roomId] = true;

            if (this._user) {
                // Save entering this room to resume the session again later.
                this._userRef.child('rooms').child(roomId).set({
                    id: roomId,
                    name: roomName,
                    active: true
                });

                // Set presence bit for the room and queue it for removal on disconnect.
                const presenceRef = this._firebase
                    .child('room-users').child(roomId).child(this._userId).child(this._sessionId);
                this._queuePresenceOperation(presenceRef, {
                    id: this._userId,
                    name: this._userName
                }, null);
            }

            // Invoke our callbacks before we start listening for new messages.
            this._onEnterRoom({id: roomId, name: roomName});

            // Setup message listeners
            this._roomRef.child(roomId).once('value', (snapshot) => {
                this._messageRef.child(roomId)
                    .limitToLast(this._options.numMaxMessages).on('child_added', (snapshot) => {
                        this._onNewMessage(roomId, snapshot);
                    }, () => { // onCancel
                        // Turns out we don't have permission to access these messages.
                        this.leaveRoom(roomId);
                    }, this);

                this._messageRef.child(roomId)
                    .limitToLast(this._options.numMaxMessages).on('child_removed', (snapshot) => {
                        this._onRemoveMessage(roomId, snapshot);
                    }, () => { // onCancel
                    }, this);
            }, () => { // onFailure
            }, this);
        });
    }

    /**
     * Leaves the chat room with the specified id. On success, all methods bound to the room-exit event will be invoked.
     *
     * @param {String} roomId
     */
    @requireAuth
    leaveRoom(roomId: String) {
        var userRoomRef = this._firebase.child('room-users').child(roomId);

        // Remove listener for new messages to this room.
        this._messageRef.child(roomId).off();

        if (this._user) {
            var presenceRef = userRoomRef.child(this._userId).child(this._sessionId);

            // Remove presence bit for the room and cancel on-disconnect removal.
            this._removePresenceOperation(presenceRef.toString(), null);

            // Remove session bit for the room.
            this._userRef.child('rooms').child(roomId).remove();
        }

        delete this._rooms[roomId];

        // Invoke event callbacks for the room-exit event.
        this._onLeaveRoom(roomId);
    }

    /**
     * Sends the message content to the room with the specified id and invokes the callback on completion.
     *
     * @param {String} roomId
     * @param {String} messageContent
     * @param {String} messageType
     * @returns {Promise}
     */
    @requireAuth
    sendMessage(roomId, messageContent, messageType) {
        var message = {
            userId: this._userId,
            name: this._userName,
            timestamp: Firebase.ServerValue.TIMESTAMP,
            message: messageContent,
            type: messageType || 'default'
        };

        if (!this._user) {
            this._onAuthRequired();

            return Promise.reject(new Error('Not authenticated or user not set!'));
        }

        const newMessageRef = this._messageRef.child(roomId).push();
        return newMessageRef.setWithPriority(message, Firebase.ServerValue.TIMESTAMP);
    }

    deleteMessage(roomId, messageId, cb) {
        this._messageRef.child(roomId).child(messageId).remove(cb);
    }

    /**
     * Mute or unmute a given user by id. This list will be stored internally and
     * all messages from the muted clients will be filtered client-side after
     * receipt of each new message.
     *
     * @param {String} userId
     */
    toggleUserMute(userId: String) {
        if (!this._user) {
            this._onAuthRequired();
            if (cb) {
                cb(new Error('Not authenticated or user not set!'));
            }
            return;
        }

        return this._userRef.child('muted').child(userId).transaction((isMuted) => {
            return (isMuted) ? null : true;
        });
    }

    /**
     * Send a moderator notification to a specific user.
     *
     * @param userId
     * @param notificationType
     * @param data
     * @param cb
     */
    sendSuperuserNotification(userId, notificationType, data, cb) {
        var userNotificationsRef = this._firebase.child('users').child(userId).child('notifications');

        userNotificationsRef.push({
            fromUserId: this._userId,
            timestamp: Firebase.ServerValue.TIMESTAMP,
            notificationType: notificationType,
            data: data || {}
        }, cb);
    }

    /**
     * Warn a user for violating the terms of service or being abusive.
     *
     * @param userId
     */
    warnUser(userId) {
        this.sendSuperuserNotification(userId, 'warning');
    }

    /**
     * Suspend a user by putting the user into read-only mode for a period.
     *
     * @param userId
     * @param timeLengthSeconds
     * @param cb
     */
    suspendUser(userId, timeLengthSeconds, cb) {
        var suspendedUntil = new Date().getTime() + 1000 * timeLengthSeconds;

        this._suspensionsRef.child(userId).set(suspendedUntil, (error) => {
            if (error && cb) {
                return cb(error);
            } else {
                this.sendSuperuserNotification(userId, 'suspension', {
                    suspendedUntil: suspendedUntil
                });
                return cb(null);
            }
        });
    }

    /**
     * Invite a the specified user to the specific chat room.
     *
     * @param {String} userId
     * @param {String} roomId
     */
    @requireAuth
    inviteUser(userId: String, roomId: String) {
        var sendInvite = () => {
            var inviteRef = this._firebase.child('users').child(userId).child('invites').push();
            inviteRef.set({
                id: inviteRef.key(),
                fromUserId: this._userId,
                fromUserName: this._userName,
                roomId: roomId
            });

            // Handle listen unauth / failure in case we're kicked.
            inviteRef.on('value', this._onFirechatInviteResponse, () => {
            }, this);
        };

        if (!this._user) {
            this._onAuthRequired();
            return;
        }

        this.getRoom(roomId).then((room) => {
            if (room.type === 'private') {
                var authorizedUserRef = this._roomRef.child(roomId).child('authorizedUsers');
                authorizedUserRef.child(userId).set(true, (error) => {
                    if (!error) {
                        sendInvite();
                    }
                });
            } else {
                sendInvite();
            }
        });
    }
    /**
     * Accept the specified invite, join the relevant chat room, and notify the user who sent it.
     *
     * @param {String} inviteId
     * @returns {Promise}
     */
    @requireAuth
    acceptInvite(inviteId: String) {
        return this._userRef.child('invites').child(inviteId).once('value', (snapshot) => {
            const invite = snapshot.val();

            if (invite === null) {
                throw new Error('acceptInvite(' + inviteId + '): invalid invite id');
            } else {
                this.enterRoom(invite.roomId);

                return this._userRef.child('invites').child(inviteId).update({
                    'status': 'accepted',
                    'toUserName': this._userName
                });
            }
        }, this);
    }

    /**
     * Decline the specified invite and notify the user who sent it.
     *
     * @param {String} inviteId
     * @returns {Promise}
     */
    @requireAuth
    declineInvite(inviteId: String) {
        var updates = {
            'status': 'declined',
            'toUserName': this._userName
        };

        return this._userRef.child('invites').child(inviteId).update(updates);
    }

    /**
     * Fetch the list of all chat rooms.
     *
     * @returns {Promise.<Array<{id: String, name: String, type: String, createdAt: Number}>>}
     */
    @permitAll
    getRoomList() {
        return this._roomRef.once('value').then((snapshot) => {
            const rooms = snapshot.val();

            return Object.keys(rooms).map((id) => rooms[id]);
        });
    }

    /**
     * Fetch the list of users in the specified chat room, with an optional limit.
     *
     * @param {String} roomId
     * @param {Number} limit
     * @returns {Promise.<Array<{id: String, name: String}>>}
     */
    @permitAll
    getUsersByRoom(roomId: String, limit: Number) {
        var query = this._firebase.child('room-users').child(roomId);
        query = (limit) ? query.limitToLast(limit) : query;

        return query.once('value').then((snapshot) => {
            var usernames = snapshot.val() || {};
            var usernamesUnique = {};

            for (var username in usernames) {
                for (var session in usernames[username]) {
                    // Skip all other sessions for this user as we only need one.
                    usernamesUnique[username] = usernames[username][session];
                    break;
                }
            }

            return Object.keys(usernamesUnique).map((name) => usernamesUnique[name]);
        });
    }

    /**
     * Fetch the list of all active users, starting with the specified prefix,
     * optionally between the specified startAt and endAt values, up to the optional, specified limit.
     *
     * @param {String} prefix
     * @param {String} startAt
     * @param {String} endAt
     * @param {Number} limit
     * @returns {Promise.<Array<{id: String, name: String}>>}
     */
    @permitAll
    getUsersByPrefix(prefix: String, startAt: String, endAt: String, limit: Number) {
        var query = this._usersOnlineRef;
        var prefixLower = prefix.toLowerCase();

        if (startAt) {
            query = query.startAt(null, startAt);
        } else if (endAt) {
            query = query.endAt(null, endAt);
        } else {
            query = (prefixLower) ? query.startAt(null, prefixLower) : query.startAt();
        }

        query = (limit) ? query.limitToLast(limit) : query;

        return query.once('value').then((snapshot) => {
            var usernames = snapshot.val() || {};
            var usernamesFiltered = {};

            for (var userNameKey in usernames) {
                var sessions = usernames[userNameKey];
                var userName;
                var userId;
                var usernameClean;

                // Grab the user data from the first registered active session.
                for (var sessionId in sessions) {
                    userName = sessions[sessionId].name;
                    userId = sessions[sessionId].id;

                    // Skip all other sessions for this user as we only need one.
                    break;
                }

                // Filter out any usernames that don't match our prefix and break.
                if ((prefix.length > 0) && (userName.toLowerCase().indexOf(prefixLower) !== 0)) {
                    continue;
                }

                usernamesFiltered[userName] = {
                    name: userName,
                    id: userId
                };
            }

            const users = usernamesFiltered;

            return Object.keys(users).map((name) => users[name]);
        });
    }

    /**
     * Fetch the metadata for the specified chat room.
     *
     * @param {String} roomId
     * @returns {Promise}
     */
    @permitAll
    getRoom(roomId) {
        return this._roomRef.child(roomId).once('value').then((snapshot) => {
            return snapshot.val();
        });
    }

    userIsModerator() {
        return this._isModerator;
    }

    warn(msg) {
        if (console) {
            msg = 'Firechat Warning: ' + msg;
            if (typeof console.warn === 'function') {
                console.warn(msg);
            } else if (typeof console.log === 'function') {
                console.log(msg);
            }
        }
    }

    /**
     * 인증
     *
     * @returns {Promise}
     */
    authenticate() {
        return new Promise((resolve, reject) => {
            const auth = this._firebase.getAuth();
            if (auth) {
                this.setUser(auth.uid, auth.github.displayName, () => {
                    resolve(auth);
                });
            } else {
                this._firebase.authWithOAuthPopup('github', (error, auth) => {
                    if (error) {
                        reject(error);
                    } else {
                        this.setUser(auth.uid, auth.github.displayName, () => {
                            resolve(auth);
                        });
                    }
                });
            }
        });
    }

    /**
     * Load the initial metadata for the user's account and set initial state.
     *
     * @param onComplete
     * @private
     */
    _loadUserMetadata(onComplete) {
        // Update the user record with a default name on user's first visit.
        this._userRef.transaction((current) => {
            if (!current || !current.id || !current.name) {
                return {
                    id: this._userId,
                    name: this._userName
                };
            }
        }, (error, committed, snapshot) => {
            if (!error) {
                this._user = snapshot && snapshot.val();
                this._moderatorsRef.child(this._userId).once('value', (snapshot) => {
                    this._isModerator = !!snapshot.val();
                    setTimeout(onComplete, 0);
                });
            }
        });
    }

    /**
     * Initialize Firebase listeners and callbacks for the supported bindings.
     *
     * @private
     */
    _setupDataEvents() {
        // Monitor connection state so we can requeue disconnect operations if need be.
        this._firebase.root().child('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === true) {
                // We're connected (or reconnected)! Set up our presence state.
                for (var i = 0; i < this._presenceBits; i++) {
                    var op = this._presenceBits[i];
                    var ref = this._firebase.root().child(op.ref);

                    ref.onDisconnect().set(op.offlineValue);
                    ref.set(op.onlineValue);
                }
            }
        }, this);

        // Generate a unique session id for the visit.
        var sessionRef = this._userRef.child('sessions').push();
        this._sessionId = sessionRef.key();
        this._queuePresenceOperation(sessionRef, true, null);

        // Register our username in the public user listing.
        var usernameRef = this._usersOnlineRef.child(this._userName.toLowerCase());
        var usernameSessionRef = usernameRef.child(this._sessionId);
        this._queuePresenceOperation(usernameSessionRef, {
            id: this._userId,
            name: this._userName
        }, null);

        // Listen for state changes for the given user.
        this._userRef.on('value', this._onUpdateUser, this);

        // Listen for chat invitations from other users.
        this._userRef.child('invites').on('child_added', this._onFirechatInvite, this);

        // Listen for messages from moderators and adminstrators.
        this._userRef.child('notifications').on('child_added', this._onNotification, this);
    }

    /**
     * Append the new callback to our list of event handlers.
     *
     * @param eventId
     * @param callback
     * @private
     */
    _addEventCallback(eventId, callback) {
        this._events[eventId] = this._events[eventId] || [];
        this._events[eventId].push(callback);
    }

    /**
     * Retrieve the list of event handlers for a given event id.
     *
     * @param eventId
     * @returns {*}
     * @private
     */
    _getEventCallbacks(eventId) {
        if (this._events.hasOwnProperty(eventId)) {
            return this._events[eventId];
        }
        return [];
    }

    /**
     * Invoke each of the event handlers for a given event id with specified data.
     *
     * @param eventId
     * @private
     */
    _invokeEventCallbacks(eventId) {
        var args = [];
        var callbacks = this._getEventCallbacks(eventId);

        Array.prototype.push.apply(args, arguments);
        args = args.slice(1);

        for (var i = 0; i < callbacks.length; i += 1) {
            callbacks[i].apply(null, args);
        }
    }

    /**
     * Keep track of on-disconnect events so they can be requeued if we disconnect the reconnect.
     *
     * @param ref
     * @param onlineValue
     * @param offlineValue
     * @private
     */
    _queuePresenceOperation(ref, onlineValue, offlineValue) {
        ref.onDisconnect().set(offlineValue);
        ref.set(onlineValue);
        this._presenceBits[ref.toString()] = {
            ref: ref,
            onlineValue: onlineValue,
            offlineValue: offlineValue
        };
    }

    /**
     * Remove an on-disconnect event from firing upon future disconnect and reconnect.
     *
     * @param path
     * @param value
     * @private
     */
    _removePresenceOperation(path, value) {
        var ref = new Firebase(path);
        ref.onDisconnect().cancel();
        ref.set(value);
        delete this._presenceBits[path];
    }

    /**
     * Event to monitor current user state.
     *
     * @param snapshot
     * @private
     */
    _onUpdateUser(snapshot) {
        this._user = snapshot.val();
        this._invokeEventCallbacks('user-update', this._user);
    }

    /**
     * Event to monitor current auth + user state.
     *
     * @private
     */
    _onAuthRequired() {
        this._invokeEventCallbacks('auth-required');
    }

    /**
     * Events to monitor room entry / exit and messages additional / removal.
     *
     * @param room
     * @private
     */
    _onEnterRoom(room) {
        this._invokeEventCallbacks('room-enter', room);
    }

    _onNewMessage(roomId, snapshot) {
        var message = snapshot.val();
        message.id = snapshot.key();
        this._invokeEventCallbacks('message-add', roomId, message);
    }

    _onRemoveMessage(roomId, snapshot) {
        var messageId = snapshot.key();
        this._invokeEventCallbacks('message-remove', roomId, messageId);
    }

    _onLeaveRoom(roomId) {
        this._invokeEventCallbacks('room-exit', roomId);
    }

    /**
     * Event to listen for notifications from administrators and moderators.
     *
     * @param snapshot
     * @private
     */
    _onNotification(snapshot) {
        var notification = snapshot.val();
        if (!notification.read) {
            if (notification.notificationType !== 'suspension' ||
                notification.data.suspendedUntil < new Date().getTime()) {
                snapshot.ref().child('read').set(true);
            }
            this._invokeEventCallbacks('notification', notification);
        }
    }

    /**
     * Events to monitor chat invitations and invitation replies.
     *
     * @param snapshot
     * @private
     */
    _onFirechatInvite(snapshot) {
        var invite = snapshot.val();

        // Skip invites we've already responded to.
        if (invite.status) {
            return;
        }

        invite.id = invite.id || snapshot.key();
        this.getRoom(invite.roomId).then((room) => {
            invite.toRoomName = room.name;
            this._invokeEventCallbacks('room-invite', invite);
        });
    }

    _onFirechatInviteResponse(snapshot) {
        var invite = snapshot.val();

        invite.id = invite.id || snapshot.key();
        this._invokeEventCallbacks('room-invite-response', invite);
    }
}

/**
 * 다른 어떠한 액션도 하지 않지 않는 단순 문서용 decorator
 *
 * @param {Class} cls
 * @param {String} key
 * @param {Object} descriptor
 * @returns {{value: (function())}}
 */
function permitAll(cls, key, descriptor) {
}

/**
 * 인증이 필요한 부분은 미리 인증처리
 *
 * @param {Class} cls
 * @param {String} key
 * @param {Object} descriptor
 * @returns {{value: (function())}}
 */
function requireAuth(cls, key, descriptor) {
    const callback = descriptor.value;

    if (typeof callback !== 'function') {
        throw new SyntaxError('must be function');
    }

    return {
        ...descriptor,
        value() {
            const args = arguments;

            return this.authenticate()
                .then(() => {
                    return callback.apply(this, args);
                });
        }
    };
}

