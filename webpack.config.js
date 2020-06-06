const isProd = process.argv.indexOf('-p') >= 0;
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

module.exports = {
    target: "node",
    node: {
        fs: 'empty', net: 'empty', tls: 'empty',
        child_process: 'empty', dns: 'empty',
        global: true, __dirname: true
    },
    mode: isProd ? 'production' : 'development',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    devtool: isProd ? false : 'source-map',
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            { test: /\.ts$/, exclude: /node_modules/, use: ['ts-loader'] }
        ]
    },
    watch: !isProd,
    optimization: {
        minimize: isProd
    },
    plugins: [
        new CleanWebpackPlugin({ cleanStaleWebpackAssets: false })
    ],
};