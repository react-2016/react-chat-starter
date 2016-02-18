const path = require('path');
const autoprefixer = require('autoprefixer');
const pkg = require('../package.json');

const isDevelopment = process.env.NODE_ENV !== 'production';
const scssPath = path.join(__dirname, '../scss');
const cssPath = path.join(__dirname, '../build/assets/css');
const cssFilename = pkg.name + '-' + pkg.version + '.css';
const minFilename = pkg.name + '-' + pkg.version + '.min.css';

module.exports = function(gulp, plugins) {
    return function() {
        var bundle = gulp.src([path.join(scssPath, '**/*.scss')])
            .pipe(plugins.sourcemaps.init())
            .pipe(plugins.sass().on('error', plugins.sass.logError))
            .pipe(plugins.postcss([
                autoprefixer({
                    browsers: ['last 2 versions'],
                    cascade: false
                })
            ]));

        if (isDevelopment) {
            bundle = bundle
                .pipe(plugins.rename(cssFilename))
                .pipe(plugins.sourcemaps.write('./'))
                .pipe(gulp.dest(cssPath));
        } else {
            bundle = bundle
                .pipe(plugins.minifyCss())
                .pipe(plugins.rename(minFilename))
                .pipe(gulp.dest(cssPath));
        }

        return bundle;
    };
};
