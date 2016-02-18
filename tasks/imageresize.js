const path = require('path');
const pkg = require('../package.json');

const imgPath = path.join(__dirname, '../build/assets/img');
const filename2x = 'sp_' + pkg.name + '_2x.png';
const filename = 'sp_' + pkg.name + '.png';

module.exports = function(gulp, plugins) {
    return function() {
        return gulp.src([path.join(imgPath, filename2x)])
            .pipe(plugins.imageResize({
                width: '50%',
                height: '50%'
            }))
            .pipe(plugins.rename(filename))
            .pipe(gulp.dest(imgPath));
    };
};
