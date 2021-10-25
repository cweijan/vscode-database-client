import { SSHConfig } from "@/model/interface/sshConfig";

export interface TerminalService {
    openPath(name:string,sshConfig: SSHConfig, fullPath: string): void;
    openMethod(name:string,sshConfig: SSHConfig): void;
}