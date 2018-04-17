const fs = require('fs')
const ejs = require('ejs')
const path = require('path')
const chalk = require('chalk')

//regular
const createTableReg = /(CREATE TABLE ((.|\r|\n)*?)Compact)/gi
const tableInfoReg = /CREATE TABLE `(\w+)`(?:(?:.|\r|\n)*?)COMMENT = '(.*)' ROW_FORMAT = Compact/i
const primaryKeyReg = /PRIMARY KEY \(`(.+)`\).*/i
const autoincrementReg = /\s+`(.*)`.*AUTO_INCREMENT.*,/i
const fieldReg = /\s+`(.*)`\s+(\w+)\((\d+)\).*?(?:DEFAULT\s+(.*)\s+COMMENT\s+'(.*)')?,/gi

//help functions
const isExist = function(dir) {
    dir = path.normalize(dir)
    try {
        fs.accessSync(dir, fs.R_OK)
        return true
    } catch (e) {
        return false
    }
}
const isDirectory=function (filePath) {
    if (!isExist(filePath)) return false
    try {
        const stat = fs.statSync(filePath)
        return stat.isDirectory()
    } catch (e) {
        return false
    }
}
const rmdir = function (dir) {
    var files = fs.readdirSync(dir)
    files.map(function(item){
        const filepath = path.join(dir, item)
        if (isDirectory(filepath)) return rmdir(filepath, false)
        return fs.unlinkSync(filepath)
    })

    fs.rmdirSync(dir)
}
const mkdir = function(dirPath){
    const sep = path.sep
    const initDir = path.isAbsolute(dirPath) ? sep : ''
    dirPath.split(sep).reduce((parentDir, childDir) => {
        const curDir = path.resolve(parentDir, childDir)
        if (!fs.existsSync(curDir)) {
            fs.mkdirSync(curDir)
        }
        return curDir
    }, initDir)
}
const toCamelCase = function (str){
    str = str.toLowerCase()
    return str.replace(/_(\w)/g, function (matches, letter) {
        return letter.toUpperCase()
    })
}
const log = function(msg){
    console.log('>ddl2Model ', msg)
}
const buildTables = function(matched, config){
    let result=[]
    matched.map(function (ddl) {
        let info = ddl.match(tableInfoReg)
        let primaryKey = ddl.match(primaryKeyReg)
        let autoincrementField = ddl.match(autoincrementReg)
        let fields = [], field

        while ((field = fieldReg.exec(ddl)) != null) {
            let defaultValue=field[4] || ''
            if(config.defaultValues[field[1]]) defaultValue = config.defaultValues[field[1]]
            fields.push({
                name: field[1],
                type: config.dataType[field[2].toUpperCase()],
                length: field[3],
                defaultValue:defaultValue,
                comment: field[5] || ''
            })
        }

        result[info[1]] = {
            name: info[1],
            comment: info[2] || '',
            primaryKey: primaryKey ? primaryKey[1] : null,
            fields: fields,
            autoincrementField: autoincrementField ? autoincrementField[1] : ''
        }

        fieldReg.lastIndex = 0
    })

    return result
}

const CONFIG ={
    dataType : {
        TINYINT: 'INTEGER',
        SMALLINT: 'INTEGER',
        MEDIUMINT: 'INTEGER',
        INT: 'INTEGER',
        INTEGER: 'INTEGER',
        BIGINT: 'BIGINT',
        FLOAT: 'FLOAT',
        DOUBLE: 'DOUBLE',
        DECIMAL: 'DECIMAL',
        DATE: 'DATE',
        TIME: 'DATEONLY',
        YEAR: 'INTEGER',
        DATETIME: 'DATE',
        CHAR: 'STRING',
        VARCHAR: 'STRING',
        TINYBLOB: 'BLOB',
        TINYTEXT: 'STRING',
        BLOB: 'STRING',
        TEXT: 'TEXT',
        MEDIUMBLOB: 'BLOB',
        MEDIUMTEXT: 'STRING',
        LONGBLOB: 'STRING',
        LONGTEXT: 'BLOB'
    },
    defaultValues:{},
    buildModelfileName:function(name){
        return toCamelCase(name) + '.js'
    },
    modelTmpl: fs.readFileSync(path.join(__dirname,'./model.ejs')).toString()
}

module.exports = function(sqlFilePath, outputPath, configFilePath){
    if(!isExist(sqlFilePath)){
        return log(''+chalk.red('sql文件在哪呢？'))
    }
    let config = {}
    if(configFilePath && !isExist(configFilePath)){
        return log(''+chalk.red('config文件在哪呢？'))
    }
    if(!isDirectory(outputPath)){
        mkdir(outputPath)
    } else {
        rmdir(outputPath)
        mkdir(outputPath)
    }
    try{
        config = fs.readFileSync(configFilePath).toString()
        config = JSON.parse(config)
    } catch (e){
        return log('> '+chalk.red('读取config文件失败，'+e.message))
    }
    if(config.buildModelfileName){
        try{
            config.buildModelfileName = new Function(config.buildModelfileName)
            config.buildModelfileName('test_test')
        } catch (e){
            log('> '+chalk.red('run buildModelfileName fn error.，'+e.message))
            return
        }
    }
    
    config = Object.assign({}, CONFIG, config)
    let sqlContent = ''

    log(chalk.blue('读取sql文件内容...'))
    try{
        sqlContent = fs.readFileSync(sqlFilePath, {encoding:'utf8'})
    } catch (e){
        return log('> '+chalk.red('读取sql文件失败，'+e.message))
    }
    const matched = sqlContent.match(createTableReg)

    if(matched.length === 0 ) return log(chalk.yellow('没有找到创建表的相关SQL'))

    log(chalk.blue('解析sql文件...'))
    const tables = buildTables(matched, config)
    log(chalk.blue('开始生成model文件...'))
    let ok = 0, err = 0

    Object.keys(tables).forEach(key=>{
        let table = tables[key]
        let model = ejs.render(config.modelTmpl, table)
        model = model.replace(/\n{2,}/g,'\n')
        model = model.replace(/\n(\s+)\n/g,'\n')
        let fileName = config.buildModelfileName(table.name)
        try{
            fs.writeFileSync(path.join(outputPath, fileName), model)
            ok++
        } catch (e){
            log(chalk.red('write file error:，'+e.message))
            err++
        }
    })

    log(chalk.green('生成完成，成功：'+ok+'， 失败：'+ err +' 。'))
}