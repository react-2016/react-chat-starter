const path = require('path');

const scssPath = path.join(__dirname, '../scss');
var configPath = path.join(__dirname, '../.scss-lint.yml');

module.exports = function(gulp, plugins) {
    return function() {
        return gulp.src([path.join(scssPath, '**/*.scss')])
                   .pipe(plugins.scssLint({config: configPath}));
    };
};
