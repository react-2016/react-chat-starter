module.exports = function(gulp, plugins) {
    return function(mainTask, subTask) {
        if (subTask) {
            return require('./' + mainTask)[subTask](gulp, plugins);
        }
        return require('./' + mainTask)(gulp, plugins);
    };
};
