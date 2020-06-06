const isProd = process.argv.indexOf('-p') >= 0;
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
    node: {
        fs: 'empty', net: 'empty', tls: 'empty',
        child_process: 'empty', dns: 'empty',
        global: true, __dirname: true
    },
    entry: {
        extension: './src/extension.ts',
        query: './src/vue/pages/result/main.js'
    },
    output: {
        path: path.resolve(__dirname, 'out'),
        filename: '[name].js',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.vue', '.js'],
        alias: {
            'vue$': 'vue/dist/vue.esm.js',
            '@': path.resolve('src'),
        }
    },
    module: {
        rules: [
            { test: /\.vue$/, loader: 'vue-loader', options: { loaders: { css: ["vue-style-loader", "css-loader"], optimizeSSR: false } } },
            { test: /\.ts$/, exclude: /node_modules/, use: ['ts-loader'] },
            { test: /\.css$/, use: ["vue-style-loader", 'css-loader'] },
            {
                test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
                loader: 'url-loader',
                options: {
                    limit: 10000
                }
            }
        ]
    },
    plugins: [
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({
            filename: '../resources/webview/pages/result/index.html', template: './src/vue/pages/result/index.html',
            chunks: ['query'], inject: true
        }),
        new CleanWebpackPlugin({ cleanStaleWebpackAssets: false })
    ],
    watch: !isProd,
    optimization: {
        minimize: isProd
    },
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'source-map',
};