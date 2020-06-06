const isProd = process.argv.indexOf('-p') >= 0;
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = [
    {
        target: "node",
        node: {
            fs: 'empty', net: 'empty', tls: 'empty',
            child_process: 'empty', dns: 'empty',
            global: true, __dirname: true
        },
        entry: ['./src/extension.ts'],
        output: {
            path: path.resolve(__dirname, 'out'),
            filename: 'extension.js',
            libraryTarget: 'commonjs2'
        },
        externals: {
            vscode: 'commonjs vscode'
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: ['ts-loader'] }] },
        watch: !isProd,
        optimization: { minimize: false },
        mode: isProd ? 'production' : 'development',
        devtool: isProd ? false : 'source-map',
    },
    {
        entry: {
            query: './src/vue/pages/result/main.js',
            connect: './src/vue/pages/connect/main.js',
            status: './src/vue/pages/status/main.js'
        },
        output: {
            path: path.resolve(__dirname, 'out'),
            filename: 'webview/js/[name].js'
        },
        resolve: {
            extensions: ['.vue', '.js'],
            alias: { 'vue$': 'vue/dist/vue.esm.js', '@': path.resolve('src'), }
        },
        module: {
            rules: [
                { test: /\.vue$/, loader: 'vue-loader', options: { loaders: { css: ["vue-style-loader", "css-loader"] } } },
                { test: /\.css$/, use: ["vue-style-loader", "css-loader"] },
                { test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/, loader: 'url-loader', options: { limit: 80000 } }
            ]
        },
        plugins: [
            new VueLoaderPlugin(),
            new HtmlWebpackPlugin({
                chunks: ['query'], inject: true, template: './src/vue/pages/common.html',
                filename: 'webview/result.html'
            }),
            new HtmlWebpackPlugin({
                chunks: ['connect'], inject: true, template: './src/vue/pages/common.html',
                filename: 'webview/connect.html'
            }),
            new HtmlWebpackPlugin({
                chunks: ['status'], inject: true, template: './src/vue/pages/common.html',
                filename: 'webview/status.html'
            }),
            // new CleanWebpackPlugin({ cleanStaleWebpackAssets: false })
        ],
        watch: !isProd,
        optimization: {
            minimize: isProd,
            splitChunks: {
                cacheGroups: {
                    vendor: {
                        name: "vendor",
                        test: /[\\/]node_modules[\\/]/,
                        chunks: "all",
                        priority: 10 // 优先级
                    }
                }
            }
        },
        mode: isProd ? 'production' : 'development',
        devtool: isProd ? false : 'source-map',
    }
];