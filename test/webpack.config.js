const path = require('path');

module.exports = {
    entry: path.resolve(__dirname, './Test.ts'),
    output: {
        path: path.resolve(__dirname, '../dist'),
    },
    mode: 'development',
    devtool: false,
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader'
                    },
                    {
                        loader: path.resolve(__dirname,'../src/loader.js'),
                        options: {},
                    },
                ],
            },
        ],
    },
    resolve: {
        modules: [
            path.resolve(__dirname),
            'node_modules'
        ],
        extensions: ['.ts', '.js'],
        alias: {
            'ts-validate-schema': path.resolve(__dirname, '../src/index.js'),
        },
    }
};
