const path = require('path');

module.exports = {
    entry: './src/index.ts',
    mode: 'production',
    // TODO devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: 'commento.js',
        path: path.resolve(__dirname, 'build'),
    },
};
