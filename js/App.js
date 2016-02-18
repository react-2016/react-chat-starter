import React from 'react';
import ReactDOM from 'react-dom';
import Greeting from './components/Greeting';

class App {
    static main() {
        const wrapper = document.querySelector('.wrap');

        ReactDOM.render(<Greeting/>, wrapper);
    }
}

window.App = App;
