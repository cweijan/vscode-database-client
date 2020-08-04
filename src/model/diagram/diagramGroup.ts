import * as path from "path";
import { Constants, ModelType, Template } from "../../common/constants";
import { ConnectionManager } from "../../service/connectionManager";
import { DatabaseCache } from "../../service/common/databaseCache";
import { QueryUnit } from "../../service/queryUnit";
import { InfoNode } from "../other/infoNode";
import { Node } from "../interface/node";
import { DiagramNode } from "./diagramNode";
import { ViewManager } from "../../view/viewManager";


function getData() {
    // create the model for the E-R diagram
    var colors = {
      red: "#be4b15",
      green: "#52ce60",
      blue: "#6ea5f8",
      lightred: "#fd8852",
      lightblue: "#afd4fe",
      lightgreen: "#b9e986",
      pink: "#faadc1",
      purple: "#d689ff",
      orange: "#fdb400"
    };
    var nodeDataArray = [
      {
        key: "Products",
        items: [
          {
            name: "ProductID",
            iskey: true,
            figure: "Decision",
            color: colors.red
          },
          {
            name: "ProductName",
            iskey: false,
            figure: "Hexagon",
            color: colors.blue
          },
          {
            name: "SupplierID",
            iskey: false,
            figure: "Decision",
            color: "purple"
          },
          {
            name: "CategoryID",
            iskey: false,
            figure: "Decision",
            color: "purple"
          }
        ]
      },
      {
        key: "Suppliers",
        items: [
          {
            name: "SupplierID",
            iskey: true,
            figure: "Decision",
            color: colors.red
          },
          {
            name: "CompanyName",
            iskey: false,
            figure: "Hexagon",
            color: colors.blue
          },
          {
            name: "ContactName",
            iskey: false,
            figure: "Hexagon",
            color: colors.blue
          },
          {
            name: "Address",
            iskey: false,
            figure: "Hexagon",
            color: colors.blue
          }
        ]
      },
      {
        key: "Categories",
        items: [
          {
            name: "CategoryID",
            iskey: true,
            figure: "Decision",
            color: colors.red
          },
          {
            name: "CategoryName",
            iskey: false,
            figure: "Hexagon",
            color: colors.blue
          },
          {
            name: "Description",
            iskey: false,
            figure: "Hexagon",
            color: colors.blue
          },
          {
            name: "Picture",
            iskey: false,
            figure: "TriangleUp",
            color: colors.pink
          }
        ]
      },
      {
        key: "Order Details",
        items: [
          {
            name: "OrderID",
            iskey: true,
            figure: "Decision",
            color: colors.red
          },
          {
            name: "ProductID",
            iskey: true,
            figure: "Decision",
            color: colors.red
          },
          {
            name: "UnitPrice",
            iskey: false,
            figure: "Circle",
            color: colors.green
          },
          {
            name: "Quantity",
            iskey: false,
            figure: "Circle",
            color: colors.green
          },
          {
            name: "Discount",
            iskey: false,
            figure: "Circle",
            color: colors.green
          }
        ]
      }
    ];
    var linkDataArray = [
      { from: "Products", to: "Suppliers" },
      { from: "Products", to: "Categories" },
      { from: "Order Details", to: "Products" }
    ];
    return {
      copiesArrays: true,
      copiesArrayObjects: true,
      nodeDataArray: nodeDataArray,
      linkDataArray: linkDataArray
    };
  }

export class DiagramGroup extends Node {
    openAdd() {
        ViewManager.createWebviewPanel({
            path: "diagram", title: "diagram",
            splitView: false, eventHandler(handler) {
                handler.on("init", () => {
                    handler.emit('load',getData())
                })
            }
        })
    }

    public contextValue = ModelType.DIAGRAM_GROUP;
    public iconPath = "D:\\download\\increase.svg"
    // public iconPath = path.join(Constants.RES_PATH, "icon/diagram.svg")
    constructor(readonly info: Node) {
        super("DIAGRAM")
        this.id = `${info.getConnectId()}_${info.database}_${ModelType.DIAGRAM_GROUP}`;
        this.init(info)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return []
    }

}