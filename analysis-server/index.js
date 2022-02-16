const { decrypt } = require("./des");
const express = require('express')
const app = express()
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require("mysql2")
const format = require('date-format');

const con = mysql.createConnection('mysql://root:root@127.0.0.1:3306/test')

app.use(cors()).use(bodyParser.text({ type: "*/*" }))
    .get("/", (req, res) => {
        res.send(req.socket.remoteAddress.replace('::ffff:', ''))
    })
    .post("/a", (req, res) => {
        const body = req.body;
        try {
            const dec = JSON.parse(decrypt(body))
            const ip = req.socket.remoteAddress;
            console.log(JSON.stringify(dec))
            con.query(`insert into user(create_time,ip,user_name,platform,version,info,ext,git_name) values
        ('${format('yyyy-MM-dd hh:mm:ss', new Date())}','${(ip || '').replace('::ffff:', '')}',
        '${trim(dec.u)}','${dec.p}','${dec.v}','${trim(dec.i)}','${dec.e}','${trim(dec.g)}')`)
            res.json({ s: true, ip })
        } catch (error) {
            console.log(error)
            res.json({})
        }

    })

function trim(str) {
    if (!str) return ''
    return str.replace(/'/g, '\'\'')
}

const port = 873;
app.listen(port)
console.log(`启动数据分析程序成功`)