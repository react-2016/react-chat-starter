const path = require('path');
const pkg = require('../package.json');

const isDev = process.env.NODE_ENV !== 'production';
const srcPath = path.join(__dirname, '../html');
const distPath = path.join(__dirname, '../build');

module.exports = function(gulp, plugins) {
    return function() {
        return gulp.src([path.join(srcPath, '*.html')])
            .pipe(plugins.fileInclude({
                prefix: '@@',
                context: {
                    filename: pkg.name + '-' + pkg.version,
                    min: isDev ? '' : '.min'
                }
            }))
            .pipe(gulp.dest(distPath));
    };
};
