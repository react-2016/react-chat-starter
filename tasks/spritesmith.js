const path = require('path');
const fs = require('fs');
const Mustache = require('mustache');
const pkg = require('../package.json');

const imgPath = path.join(__dirname, '../build/assets/img');
const srcPath = path.join(__dirname, '../build/assets/img/sp');
const scssPath = path.join(__dirname, '../scss/core');
const imgFilename = 'sp_' + pkg.name + '_2x.png';
const scssFilename = '_sprites.scss';
const templateFile = 'sprites.mustache';

module.exports = function(gulp, plugins) {
    return function() {
        return gulp.src([path.join(srcPath, '**/*')])
            .pipe(plugins.spritesmith({
                imgName: path.join(imgPath, imgFilename),
                cssName: path.join(scssPath, scssFilename),
                imgPath: '../img/' + imgFilename,
                padding: 4,
                cssSpritesheetName: 'sp-' + pkg.name,
                cssTemplate: function(params) {
                    const template = fs.readFileSync(templateFile, 'utf8');

                    return Mustache.render(template, params);
                },
                cssOpts: {
                    // 비 레티나용 이미지 경로를 반환한다.
                    path: function() {
                        return function(text, render) {
                            return render(text).replace('_2x', '');
                        };
                    },
                    // zerounit 검증을 통과하기 위해 0px를 0으로 변환한다.
                    zerounit: function() {
                        return function(text, render) {
                            const value = render(text);
                            return value === '0px' ? '0' : value;
                        };
                    },
                    // 레티나 대응을 위해서 width, height, offset을 pixel ratio로 나눈다.
                    retina: function() {
                        return function(text, render) {
                            const pixelRatio = 2;
                            return parseInt(render(text), 10) / pixelRatio + 'px';
                        };
                    }
                }
            }))
            .pipe(gulp.dest('./'));
    };
};
