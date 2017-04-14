#!/usr/bin/env node

/**
 * Created by zhangshuang on 2017/4/13.
 */
var express = require('express'); //nodejs服务器框架
var watch = require('watch'); //监听模块
var fs = require('fs'); //nodejs文件处理模块
var path = require('path'); //路径模块
var uglifyCss = require('uglifycss'); //合并压缩css
var uglifyJS = require('uglifyjs'); //合并压缩js
var cheerio = require('cheerio'); //服务端jquery
var command = require('commander'); //nodejs命令模块
var package = require('./package.json'); //package.json

var app = express(); //创建express对象
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var $ = cheerio.load(getHtml()); //获取index.html内容并在index.html中添加socket.xml，使得项目可以实现修改文件内容自动更新

var config = { //项目配置
    output: "./dist"
}

command
    .command('dist').action(function () { bundle(); }) //命令模块，输入 zst bundle 执行 bundle()方法，打包;
    .version(package.version) //版本号

    // .option('-p, --peppers', 'Add peppers')
    // .option('-P, --pineapple', 'Add pineapple')
    // .option('-b, --bbq-sauce', 'Add bbq sauce')
    // .option('-c, --cheese [type]', 'Add the specified type of cheese [marble]', 'marble')
    .parse(process.argv);

command.parse(process.argv); //开始解析用户输入的命令，这个不能跟上面的命令放到同一行
app.get('/', function (req, res) {
    res.send(getHtml());
});

app.use(express.static('./src')); //将静态文件路径指向'./src'

server.listen(3000, function (req, res) {
    console.log('server start');
});

io.sockets.on('connection', function (socket) {
    watch.watchTree('./src', function (f, curr, prev) {
        if (typeof f == "object" && prev === null && curr === null) {
            // Finished walking the tree
        } else if (prev === null) {
            // f is a new file
            socket.emit('file-add');
        } else if (curr.nlink === 0) {
            // f was removed
            socket.emit('file-removed');
        } else { // f was changed
            socket.emit('file-change');
        }
    });
    console.log('client connected');
});

function bundle() { //合并压缩css、js并添加时间戳，移动index.html文件
    handleDir(config.output); //处理输出目录

    let uglifiedCss = uglifyCss.processFiles(getCssArr(), { maxLineLen: 500, expandVars: true});
    let uglifiedJs = uglifyJS.minify(getJsArr(), {
        compress: {
            dead_code: true,
            global_defs: {
                DEBUG: false
            }
        }
    });

    var cssName = "./bundle." + new Date().getTime() + ".css"; //添加时间戳
    fs.writeFileSync(config.output+'/'+cssName.slice(1), uglifiedCss); //将合并的css文件写入bundle.css
    console.log('生成bundle.css文件');
    var jsName = "./bundle." + new Date().getTime() + ".js";
    fs.writeFileSync(config.output+'/'+jsName.slice(1), uglifiedJs.code);
    console.log('生成bundle.js文件');

    $('head').append('<link href="'+cssName+'" rel="stylesheet"/>'); //在html中添加打包好的css、js文件
    $('html').append('<script src="'+jsName+'" /></script>');
    fs.writeFileSync(config.output+'/index.html', $.html());
}

function getHtml() { //获取index.html
    return fs.readFileSync('./src/index.html', 'utf-8') + fs.readFileSync('./socket.xml');
}

function getCssArr() { //获取css的href属性列表
    let cssArr = [];
    let link = $('link');
    for(let i = 0, len = link.length; i < len; i++) {
        cssArr.push("./src"+link[i].attribs.href.slice(1));
    }
    link.remove();
    return cssArr;
}

function getJsArr() { //获取js的src属性列表
    let scriptArr = [];
    let script = $('script');
    for(let i = 0, len = script.length - 2; i < len; i++) { //length-2是因为会在html最后增添socket.xml中的script标签
        scriptArr.push("./src/" + script[i].attribs.src);
    }
    script.remove();
    return scriptArr;
}

function handleDir(dirpath) { //删除原有目录，生成新目录
    if(fs.existsSync(dirpath)) { //监测目录是否存在
        delDir(dirpath); //存在就递归删除目录
        console.log('删除'+dirpath.slice(2)+'目录成功');
        fs.mkdirSync(dirpath); //生成目录
        console.log(dirpath.slice(2) + '目录创建成功');
    }else {
        fs.mkdirSync(dirpath); //生成目录
        console.log(dirpath.slice(2) + '目录创建成功');
    }
}

function delDir(path) { //递归删除生产环境输出目录
    var files = [];
    files = fs.readdirSync(path);
    files.forEach(function (file, index) {
        var curPath = path + '/' + file;
        if(fs.statSync(curPath).isDirectory()) {
            delDir(curPath);
        }else {
            fs.unlinkSync(curPath);
        }
    });
    fs.rmdirSync(path);
}


