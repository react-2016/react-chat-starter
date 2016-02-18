module.exports = function(gulp, plugins) {
    return function() {
        return gulp.src(['gulpfile.js', 'tasks/**/*.js', 'tests/**/*.js', 'js/**/*.js'])
            .pipe(plugins.eslint({useEslintrc: true}))
            .pipe(plugins.eslint.format())
            .pipe(plugins.eslint.failAfterError())
            .pipe(plugins.jscs())
            .pipe(plugins.jscs.reporter())
            .pipe(plugins.jscs.reporter('fail'));
    };
};
