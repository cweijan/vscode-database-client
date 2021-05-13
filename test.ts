import SQLite from "./src/service/connect/sqlite";
import {execute} from "./src/service/connect/sqlite/sqlite";
const sqlite = new SQLite( 'C:/Users/CWJ/Desktop/Ditto_2.db');

sqlite.query('SELECT name FROM sqlite_master;').then((res:any)=>{
    console.log(JSON.stringify(res))
})

execute('sqlite/sqlite-v3.26.0-win32-x86.exe','C:/Users/CWJ/Desktop/Ditto_2.db','SELECT * FROM data limit 12;',(res=>{
    console.log(JSON.stringify(res))
}))

// execute('sqlite/sqlite-v3.26.0-win32-x86.exe','C:/Users/CWJ/Desktop/Ditto_2.db','SELECT name FROM Data_ID;',(res=>{
//     console.log(JSON.stringify(res))
// }))


execute('sqlite/sqlite-v3.26.0-win32-x86.exe','C:/Users/CWJ/Desktop/Ditto_2.db','SELECT * FROM data limit 12;',(res=>{
    console.log(JSON.stringify(res))
}))

// sqlite.query('create table e(id int);').then((res:any)=>{
//     console.log(res.header)
//     console.log(res.rows)
// })

// execute('sqlite/sqlite-v3.26.0-win32-x86.exe','C:/Users/CWJ/Desktop/Ditto_2.db','create table f(id int);',(res=>{
//     console.log(JSON.stringify(res))
// }))