var path = require('path');
var Server = require('karma').Server;

module.exports = function() {
    return function(done) {
        var server = new Server({
            configFile: path.join(__dirname, '../karma.conf.js')
        }, done);

        server.start();
    };
};
