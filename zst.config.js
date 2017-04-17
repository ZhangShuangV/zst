#!/usr/bin/env node

/**
 * Created by zhangshuang on 2017/4/13.
 */
var express = require('express'); //nodejs服务器框架
var watch = require('watch'); //监听模块
var command = require('commander'); //nodejs命令模块
var fs = require('fs'); //nodejs文件处理模块
var path = require('path'); //路径模块
var uglifyCss = require('uglifycss'); //合并压缩css
var uglifyJS = require('uglifyjs'); //合并压缩js
var cheerio = require('cheerio'); //服务端jquery
var open = require('open'); //自动打开浏览器
var package = require('./package.json'); //package.json

var app = express(); //创建express对象
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var $ = cheerio.load(getHtml()); //获取index.html内容并在index.html中添加socket.xml，使得项目可以实现修改文件内容自动更新

const config = { //项目配置
    server: {
        ip: "http://localhost",
        port: 3000
    },
    input: "./src",
    output: "./dist",
    info: "INFO  ",
    isPhone: true, //是否是手机
};

command.version(package.version); //版本号
command.command('dev').action(function () { develop(); }); //开发环境，输入 `zst dev` 执行 develop()方法，并打开浏览器;
command.command('dist').action(function () { bundle(); }); //命令模块，输入 `zst dist` 执行 bundle()方法，打包;
command.parse(process.argv); //开始解析用户输入的命令，这个不能跟上面的命令放到同一行

function develop() { //开发环境执行
    server.listen(config.server.port, function (req, res) {
        log('server start at '+config.server.ip+":"+config.server.port);
        open(config.server.ip+":"+config.server.port); //自动打开浏览器
    });

    app.get('/', function (req, res) {
        res.send(getHtml(config.isPhone,config.input));
    });
}



function getHtml(isPhone,path) { //获取index.html
    var path = path || './src';
    var devHtml = fs.readFileSync(path +'/index.html', 'utf-8') + fs.readFileSync('./socket.xml'); //这里不管是运行`zst dev`还是`zst dist`都会添加socket，还待修改，同时还要改动handleJs()
    if(isPhone) return fs.readFileSync('./isphone.xml') + devHtml; //其实运行`zst dist`命令时，isPhone的值为undefined，所以会一直走else部分
    else return devHtml;
}

app.use(express.static(config.input)); //将静态文件路径指向'./src'

io.sockets.on('connection', function (socket) {
    watch.watchTree(config.input, function (f, curr, prev) {
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
    log('client connected');
});

function bundle() { //合并压缩css、js并添加时间戳，移动index.html文件
    log('Start bundle');
    handleDir(); //处理输出目录
    handleCss(); //处理css
    handleJs(); //处理js
    handleHtml(); //删除html中的注释
    handleIcon(); //移动favicon.ico文件
    if(config.isPhone) handleIsPhone(); //如果是移动端就插入移动端meta及rem换算

    fs.writeFileSync(config.output+'/index.html', $.html()); //写入./dist/index.html
    log('Finish bundle');
}

function handleIsPhone() { //添加移动端meta及换算rem
    let phoneScript = fs.readFileSync('./isphone.xml') + ''; //读取的数据需要转换成字符串才能append到head中
    $('head').append(phoneScript);
    log('Append phoneScript succeed');
}

function handleCss() { //处理css
    let uglifiedCss = uglifyCss.processFiles(getCssArr(), { maxLineLen: 500, expandVars: true}); // 合并压缩css
    var cssName = "./bundle." + new Date().getTime() + ".css"; //添加时间戳
    fs.writeFileSync(config.output+'/'+cssName.slice(1), uglifiedCss); //将合并的css文件写入bundle.css
    log('Create bundle.css succeed');
    $('head').append('<link href="'+cssName+'" rel="stylesheet"/>'); //在html中添加打包好的css、js文件

    function getCssArr() { //获取css的href属性列表
        let cssArr = [];
        let link = $('link');
        let ico = $('link')[$('link').length - 1]; //找到favicon.ico的link标签
        // let ico = $('link').pop();
        ico.attribs.href = './favicon.ico';
        for(let i = 0, len = link.length - 1; i < len; i++) { //length-1是因为有favicon
            cssArr.push(config.input+ '/' +link[i].attribs.href);
        }
        link.remove(); //删除原来的link标签
        $('head').append(ico); //添加ico标签
        return cssArr;
    }
}

function handleJs() { //处理js
    let uglifiedJs = uglifyJS.minify(getJsArr(), { //合并压缩js
        compress: {
            dead_code: true,
            global_defs: {
                DEBUG: false
            }
        }
    });
    var jsName = "./bundle." + new Date().getTime() + ".js";
    fs.writeFileSync(config.output+'/'+jsName.slice(1), uglifiedJs.code);
    log('Create bundle.js succeed');
    $('body').append('<script src="'+jsName+'" /></script>');

    function getJsArr() { //获取js的src属性列表
        let scriptArr = [];
        let script = $('script');
        for(let i = 0, len = script.length - 2; i < len; i++) { //length-2是因为会在html最后增添socket.xml中的script标签
            if(script[i].attribs.src) scriptArr.push(config.input+"/" + script[i].attribs.src); //如果有这个属性就添加到scriptArr中，之后会进行合并压缩
        }
        script.remove(); //删除原来的script标签
        return scriptArr;
    }
}

function handleIcon() { //处理favicon.ico，移动文件
    let inputPath = config.input + '/img/favicon.ico';
    let outputPath = config.output + '/favicon.ico';
    let readStream = fs.createReadStream(inputPath);
    let writeStream = fs.createWriteStream(outputPath);
    readStream.pipe(writeStream);
    log('Create favicon.ico succeed');
}

function handleDir() { //删除原有目录，生成新目录
    let dirpath = config.output;
    if(fs.existsSync(dirpath)) { //监测目录是否存在
        delDir(dirpath); //存在就递归删除目录
        end = new Date().getMilliseconds();
        log('Delete '+dirpath.slice(2)+' dir succeed');
        fs.mkdirSync(dirpath); //生成目录
        end = new Date().getMilliseconds();
        log('Create '+dirpath.slice(2) + ' dir succeed');
    }else {
        fs.mkdirSync(dirpath); //生成目录
        end = new Date().getMilliseconds();
        log('Create '+dirpath.slice(2) + ' dir succeed');
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
}

function handleHtml() { //处理html
    let regex = /<!--[\s\S]*?-->/g; //删除html中的注释
    let html = $.html().replace(regex, '');

    regex = /\s{10,}/g; //删除多余的空行
    html = html.replace(regex, '');

    $('html').html(html); //重新赋值html文件
    log('Create index.html succeed');
}

function log(info, during) { //自定义console.log()
    if(!during) console.log(config.info + info);
    else console.log(config.info + info + ' in '+ during + ' μs')

}
