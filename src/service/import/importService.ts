import { Node } from "../../model/interface/node";

export interface ImportService {

    import(importPath: string, node: Node):void ;

}