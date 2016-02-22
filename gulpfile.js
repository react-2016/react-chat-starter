const gulp = require('gulp-param')(require('gulp'), process.argv);
const plugins = require('gulp-load-plugins')();
const runSequence = require('run-sequence');
const loader = require('./tasks/loader')(gulp, plugins);

// Build(s) for JavaaScript.
gulp.task('jslint', loader('jslint'));
gulp.task('jstest', loader('jstest'));
gulp.task('vendor', loader('browserify', 'vendor'));
gulp.task('script', loader('browserify', 'script'));

// Build(s) for Markup.
gulp.task('htmlinclude', loader('htmlinclude'));
gulp.task('spritesmith', loader('spritesmith'));
gulp.task('imageresize', loader('imageresize'));
gulp.task('scsslint', loader('scsslint'));
gulp.task('sass', loader('sass'));

// Dev Server.
gulp.task('instant', loader('instant'));

gulp.task('default:script', function() {
    runSequence('jslint', ['script']);
});

gulp.task('default:html', function() {
    runSequence(['htmlinclude', 'spritesmith'], 'imageresize', 'scsslint', 'sass');
});

gulp.task('default', ['vendor', 'default:script', 'default:html'], function(watch) {
    if (watch) {
        gulp.watch('html/**/*.html', ['htmlinclude']);
        gulp.watch('scss/**/*.scss', ['sass']);

        gulp.start('instant');
    }
});
