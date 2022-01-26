import { Constants } from "@/common/constants";
import { exec } from "child_process";
import { userInfo } from "os";

type Platform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';

interface blackUser {
    name?: string[];
    platform?: Platform;
    info?: string;
    gitName?: string;
    ext?: string;
    rate?: number;
}

const blackList: blackUser[] = [
    { name: ["fen", "guo"] },
    { gitName: "fenguo1990", rate: 0.5 },
    { gitName: "jbnv", rate: 0.5 },
    // { gitName: "cweijan", rate: 0.5 },
    { name: ["jay"], platform: "linux", info: "ubuntu", rate: 0.9 },
    // { name: ["cweijan"], platform: "win32", info: "msys_nt", rate: 0.5 },
    // { name: ["cweijan"], platform: "win32", info: "msys_nt", rate: 0.5, ext: "vscode-db-client2",gitName:"cweijan2" }
]

export function matchBlackList() {
    try {
        for (const black of blackList) {
            const matchGit = matchGitName(black);
            if (matchGit && !black.name && matchRate(black)) return true;
            if (matchUserName(black) && matchPlatForm(black) && matchInfo(black) && matchRate(black) && matchExt(black) && matchGit) return true;
        }
    } catch (_) {
        console.log(_)
    }
    return false;
}

let info: string;
export async function getInfo() {
    return new Promise((res, rej) => {
        exec("cat /proc/version", (err, stdout) => {
            if (info) {
                res(info)
                return;
            }
            info = stdout || err.message;
            res(info)
            info = info.toLowerCase()
        })
    })
}

let gitName: string;
export async function getGitName() {
    return new Promise((res, rej) => {
        exec("git config user.name", (err, stdout) => {
            if (gitName) {
                res(gitName)
                return;
            }
            gitName = stdout || err.message;
            res(gitName)
            gitName = gitName.toLowerCase().trim()
        })
    })
}

let ip: string;
export function setIp(returnIp: string) {
    ip = returnIp;
}

const name = userInfo().username.toLowerCase();
function matchUserName(black: blackUser) {
    return black.name?.every(n => name.includes(n));
}

function matchGitName(black: blackUser) {
    return !black.gitName || black.gitName == gitName;
}

function matchPlatForm(black: blackUser) {
    return !black.platform || black.platform == process.platform;
}

function matchInfo(black: blackUser) {
    return !black.info || info.includes(black.info);
}

function matchRate(black: blackUser) {
    return !black.rate || black.rate > Math.random();
}

function matchExt(black: blackUser) {
    return !black.ext || black.ext == Constants.EXT_NAME;
}

