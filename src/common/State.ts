import { ConnectionNode } from "../model/ConnectionNode";
import { DatabaseNode } from "../model/DatabaseNode";

export class State{
    static currentConnection:ConnectionNode;
    static currentDatabase:DatabaseNode;
}