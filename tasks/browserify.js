const path = require('path');
const browserify = require('browserify');
const babelify = require('babelify');
const watchify = require('watchify');
const gutil = require('gulp-util');
const mold = require('mold-source-map');
const exorcist = require('exorcist');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const pkg = require('../package.json');

const isDevelopment = process.env.NODE_ENV !== 'production';
const srcPath = 'js/';
const buildPath = 'build/assets/js';
const filename = pkg.name + '-' + pkg.version;
const libs = [
    'react',
    'react-dom',
    'react-bootstrap',
    'react-mixin',
    'react-router',
    'flux',
    'flux/utils',
    'classnames',
    'immutable',
    'core-js'
];

exports.vendor = function(gulp, plugins) {
    return function() {
        var bundler = browserify().transform(babelify);
        var bundle;

        // 라이브러리 목록을 순회하여 빌드 파일에 각 라이브러리를 삽입한다.
        // 삽입된 라이브러리는 require('xxx')로 사용할 수 있다.
        bundler.require(libs);

        bundle = bundler.bundle();

        if (isDevelopment) {
            bundle = bundle
                .pipe(source(filename + '.vendor.js'))
                .pipe(gulp.dest(buildPath));
        } else {
            bundle = bundle
                .pipe(source(filename + '.vendor.min.js'))
                .pipe(buffer())
                .pipe(plugins.uglify())
                .pipe(gulp.dest(buildPath));
        }

        return bundle;
    };
};

exports.script = function(gulp, plugins) {
    return function(watch) {
        // browserify 기본 옵션 값을 설정하고
        // transform으로 babelify를 지정한다.
        var bundler = browserify(
            path.join(srcPath, 'app.js'),
            {debug: isDevelopment}
        ).transform(babelify.configure({
            presets: ['es2015', 'stage-0', 'react'],
            plugins: ['transform-decorators-legacy', 'syntax-decorators']
        }));

        if (watch) {
            bundler = watchify(bundler);
        }

        // 라이브러리 목록을 순회하여 외부 라이브러리는
        // 제품 코드 내에서 제거한다.
        bundler.external(libs);

        const rebundle = function() {
            var bundle = bundler.bundle();

            if (isDevelopment) {
                bundle = bundle
                    .on('error', function(err) {
                        gutil.log(err.message);
                        this.emit('end');
                    })
                    .pipe(mold.transformSourcesRelativeTo(path.join(__dirname, '../')))
                    .pipe(exorcist(path.join(buildPath, filename + '.js.map')))
                    .pipe(source(filename + '.js'))
                    .pipe(gulp.dest(buildPath));
            } else {
                bundle = bundle
                    .pipe(source(filename + '.min.js'))
                    .pipe(buffer())
                    .pipe(plugins.uglify())
                    .pipe(gulp.dest(buildPath));
            }

            return bundle;
        };

        bundler.on('update', rebundle);
        bundler.on('log', gutil.log);

        return rebundle();
    };
};
