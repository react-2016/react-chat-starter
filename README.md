# react-chat-starter kit

`react`와 `firebase`를 활용한 간단한 채팅을 구현하며 `react`를 익히는데 목표를 둔다. `react`학습에 집중하기위해 간단하게 starter kit 작성

```
$ npm install
$ npm run build -- --watch --port 3000
```

## Example

```

import Firechat from './firechat';

const chat = new Firechat();

chat.on('message-add', (roomId, message) => {
    console.log('room id:', roomId, 'message:', message);
});

chat.on('room-enter', (room) => {
    chat.sendMessage(room.id, 'hello?', 'default')
        .then(() => {
            console.log('message sent');
        });
});

chat.createRoom('hello world', 'public')
    .then((room) => {
        console.log('created room', room.id);
    });

```