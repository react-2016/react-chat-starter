const path = require('path');
const express = require('express');
const instant = require('instant');

const rootPath = path.join(__dirname, '../build');
const app = express();

module.exports = function() {
    return function(port) {
        port = port || 3000;

        app.use(instant({root: rootPath}));

        app.get('*', function(req, res) {
            res.sendFile(path.join(rootPath, 'index.html'));
        });

        app.listen(port, function() {
            console.log('listening on port ' + port + ' and waiting for changes.');
        });
    };
};
