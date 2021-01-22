const path = require('path');
var webpack = require('webpack');

// 1. npm i tedious mysql2 node-xlsx tunnelSsh g2
// 2. npm run lib

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
            'node-xlsx': './node_modules/node-xlsx/lib/index.js',
            'tunnel-ssh': './node_modules/tunnel-ssh/index.js',
            'g2': './node_modules/@antv/g2/lib/index.js',
        } ,
        output: {
            path: path.resolve(__dirname, 'src/bin'),
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
