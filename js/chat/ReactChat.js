import Firebase from 'firebase';
import Firechat from './firechat';

/**
 * https://firechat.firebaseapp.com/docs/#api_methods
 */
export default class ReactChat extends Firechat {
    constructor(appId, options) {
        super(new Firebase(appId || 'https://amber-inferno-4139.firebaseio.com/', options));
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
     * @param {Function} callback
     */
    on(eventType: String, callback: Function) {
        super.on(eventType, callback);
    }

    /**
     * Automatically re-enters any chat rooms that the user was previously in, if the user has history saved.
     */
    @requireAuth
    resumeSession() {
        super.resumeSession();
    }

    /**
     * Creates a new room with the given name (string) and type (string - public or private) and
     * invokes the callback with the room ID on completion.
     *
     * @param {String} roomName
     * @param {String} roomType
     * @param {Function} callback
     */
    @requireAuth
    createRoom(roomName: String, roomType: String, callback: Function) {
        super.createRoom(roomName, roomType, callback);
    }

    /**
     * Enters the chat room with the specified id.
     * On success, all methods bound to the room-enter event will be invoked.
     *
     * @param {String} roomId
     */
    @requireAuth
    enterRoom(roomId: String) {
        super.enterRoom(roomId);
    }

    /**
     * Leaves the chat room with the specified id. On success, all methods bound to the room-exit event will be invoked.
     *
     * @param {String} roomId
     */
    @requireAuth
    leaveRoom(roomId: String) {
        super.leaveRoom(roomId);
    }

    /**
     * Sends the message content to the room with the specified id and invokes the callback on completion.
     *
     * @param {String} roomId
     * @param {String} messageContent
     * @param {String} messageType
     * @param {Function} callback
     */
    @requireAuth
    sendMessage(roomId, messageContent, messageType, callback) {
        super.sendMessage(roomId, messageContent, messageType, callback);
    }

    /**
     * Mute or unmute a given user by id.
     *
     * @param {String} userId
     * @param {Function} callback
     */
    @requireAuth
    toggleUserMute(userId: String, callback: Function) {
        super.toggleUserMute(userId, callback);
    }

    /**
     * Invite a the specified user to the specific chat room.
     *
     * @param {String} userId
     * @param {String} roomId
     */
    @requireAuth
    inviteUser(userId, roomId) {
        super.inviteUser(userId, roomId);
    }

    /**
     * Accept the specified invite, join the relevant chat room, and notify the user who sent it.
     *
     * @param {String} inviteId
     * @param {Function} callback
     */
    @requireAuth
    acceptInvite(inviteId, callback) {
        super.acceptInvite(inviteId, callback);
    }

    /**
     * Decline the specified invite and notify the user who sent it.
     *
     * @param {String} inviteId
     * @param {Function} callback
     */
    @requireAuth
    declineInvite(inviteId: String, callback: Function) {
        super.declineInvite(inviteId, callback);
    }

    /**
     * Fetch the list of all chat rooms.
     *
     * @param {Function} callback
     */
    @permitAll
    getRoomList(callback: Function) {
        super.getRoomList(callback);
    }

    /**
     * Fetch the list of users in the specified chat room, with an optional limit.
     *
     * @param {String} roomId
     * @param {Number} limit
     * @param {Function} callback
     */
    @permitAll
    getUsersByRoom(roomId: String, limit: Number, callback: Function) {
        if (typeof callback !== 'function') {
            callback = typeof limit === 'function' ? limit : null;
            limit = 100;
        }
        super.getUsersByRoom(roomId, limit, callback);
    }

    /**
     * Fetch the list of all active users, starting with the specified prefix,
     * optionally between the specified startAt and endAt values, up to the optional, specified limit.
     *
     * @param {String} prefix
     * @param {String} startAt
     * @param {String} endAt
     * @param {Number} limit
     * @param {Function} callback
     */
    @permitAll
    getUsersByPrefix(prefix: String, startAt: String, endAt: String, limit: Number, callback: Function) {
        super.getUsersByPrefix(prefix, startAt, endAt, limit, callback);
    }

    /**
     * Fetch the metadata for the specified chat room.
     *
     * @param {String} roomId
     * @param {Function} callback
     */
    @permitAll
    getRoom(roomId: String, callback: Function) {
        super.getRoom(roomId, callback);
    }

    /**
     * 인증
     *
     * @param {Function} cb
     */
    authenticate(cb: Function) {
        const auth = this._firebase.getAuth();
        if (auth) {
            this.setUser(auth.uid, auth.github.displayName, () => {
                cb(auth);
            });
        } else {
            this._firebase.authWithOAuthPopup('github', (error, auth) => {
                if (error) {
                    // TODO: error handling
                    console.log('auth fail', error);
                } else {
                    this.setUser(auth.uid, auth.github.displayName, () => {
                        cb(auth);
                    });
                }
            });
        }
    }
}

/**
 * 다른 어떠한 액션도 하지 않지 않는 단순 문서용 decorator
 */
function permitAll() {
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
            this.authenticate(() => {
                callback.apply(this, args);
            });
        }
    };
}
