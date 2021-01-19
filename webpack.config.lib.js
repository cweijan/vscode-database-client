const path = require('path');
var webpack = require('webpack');

// 1. npm i tedious pg mysql2
// 2. npx webpack --config webpack.config.lib.js --progress -p

module.exports = [
    {
        target: "node",
        node: {
            fs: 'empty', net: 'empty', tls: 'empty',
            child_process: 'empty', dns: 'empty',
            global: true, __dirname: true
        },
        entry: {
            tedious: './node_modules/tedious/lib/tedious.js',
            mysql2: './node_modules/mysql2/index.js',
            pg: './node_modules/pg/lib/index.js',
            routington: './node_modules/routington/lib/index.js',
            redis: './node_modules/redis/index.js',
        } ,
        output: {
            path: path.resolve(__dirname, 'out'),
            filename: '[name].js',
            libraryTarget: 'commonjs2'
        },
        externals: {
            vscode: 'commonjs vscode'
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: {
                '@': path.resolve(__dirname, './src'),
                '~': path.resolve(__dirname, './src')
            }
        },
        plugins: [
            new webpack.IgnorePlugin(/^(pg-native|supports-color)$/)
        ],
        module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: ['ts-loader'] }] },
        optimization: { minimize: true },
        watch: false,
        mode: 'production',
        devtool: false,
    }
];
