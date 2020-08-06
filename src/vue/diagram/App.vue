<template>
  <div id="container">
    <el-input v-model="diagramName" placeholder="Diagram Name" style="width:200px" />
    <el-button @click="save">Save Diagram</el-button>
    <div id="diagramPanel" style="background-color: #ffffff; border: solid 1px black; width: 100%; height: 700px"></div>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";

const vscodeEvent = getVscodeEvent();

export default {
  name: "App",
  data() {
    return {
      myDiagram: null,
      diagramName: null
    };
  },
  mounted() {
    vscodeEvent.emit("init");
    vscodeEvent.on("load", data => {
      document.getElementById("diagramPanel").style.height =
        window.innerHeight - 50 + "px";

      var $ = go.GraphObject.make; // for conciseness in defining templates

      const myDiagram = $(
        go.Diagram,
        "diagramPanel", // must name or refer to the DIV HTML element
        {
          "clickCreatingTool.archetypeNodeData": {
            key: "Node",
            color: "white"
          },
          allowDelete: true,
          allowCopy: true,
          layout: $(go.ForceDirectedLayout),
          "undoManager.isEnabled": true
        }
      );
      this.myDiagram = myDiagram;

      function nodeClicked(e, obj) {
        console.log(myDiagram.model.toJson());
      }

      // defines a context menu to be referenced in the node template
      var contextMenuTemplate = $(
        go.Adornment,
        "Vertical",
        $("ContextMenuButton", $(go.TextBlock, "Show Source!"), {
          click: nodeClicked
        })
      );

      // the template for each attribute in a node's array of item data
      var itemTempl = $(
        go.Panel,
        "Horizontal",
        $(
          go.Shape,
          {
            desiredSize: new go.Size(15, 15),
            strokeJoin: "round",
            strokeWidth: 3,
            stroke: null,
            margin: 2
          },
          new go.Binding("figure", "figure"),
          new go.Binding("fill", "color"),
          new go.Binding("stroke", "color")
        ),
        $(
          go.TextBlock,
          {
            stroke: "#333333",
            font: "bold 14px sans-serif"
          },
          new go.Binding("text", "name")
        )
      );

      // define the Node template, representing an entity
      myDiagram.nodeTemplate = $(
        go.Node,
        "Auto", // the whole node panel
        {
          contextMenu: contextMenuTemplate,
          selectionAdorned: true,
          resizable: true,
          layoutConditions: go.Part.LayoutStandard & ~go.Part.LayoutNodeSized,
          fromSpot: go.Spot.AllSides,
          toSpot: go.Spot.AllSides,
          isShadowed: true,
          shadowOffset: new go.Point(3, 3),
          shadowColor: "#C5C1AA"
        },
        new go.Binding("location", "location").makeTwoWay(),
        // whenever the PanelExpanderButton changes the visible property of the "LIST" panel,
        // clear out any desiredSize set by the ResizingTool.
        new go.Binding("desiredSize", "visible", function(v) {
          return new go.Size(NaN, NaN);
        }).ofObject("LIST"),
        // define the node's outer shape, which will surround the Table
        $(go.Shape, "RoundedRectangle", {
          fill: "#ffffff",
          stroke: "#eeeeee",
          strokeWidth: 3,
          fromLinkable: true,
          toLinkable: true,
          portId: ""
        }),
        $(
          go.Panel,
          "Table",
          { margin: 8, stretch: go.GraphObject.Fill },
          $(go.RowColumnDefinition, {
            row: 0,
            sizing: go.RowColumnDefinition.None
          }),
          // the table header
          $(
            go.TextBlock,
            {
              row: 0,
              alignment: go.Spot.Center,
              margin: new go.Margin(0, 24, 0, 2), // leave room for Button
              font: "bold 16px sans-serif"
            },
            new go.Binding("text", "key")
          ),
          // the collapse/expand button
          $(
            "PanelExpanderButton",
            "LIST", // the name of the element whose visibility this button toggles
            { row: 0, alignment: go.Spot.TopRight }
          ),
          // the list of Panels, each showing an attribute
          $(
            go.Panel,
            "Vertical",
            {
              name: "LIST",
              row: 1,
              padding: 3,
              alignment: go.Spot.TopLeft,
              defaultAlignment: go.Spot.Left,
              stretch: go.GraphObject.Horizontal,
              itemTemplate: itemTempl
            },
            new go.Binding("itemArray", "items")
          )
        ) // end Table Panel
      ); // end Node

      // define the Link template, representing a relationship
      // link config : https://gojs.net/latest/intro/links.html
      myDiagram.linkTemplate = $(
        go.Link, // the whole link panel
        {
          relinkableFrom: true,
          relinkableTo: true,
          toShortLength: 2,
          selectionAdorned: true,
          layerName: "Foreground",
          reshapable: true,
          routing: go.Link.AvoidsNodes,
          corner: 5,
          curve: go.Link.JumpOver
        },
        $(go.Shape, { stroke: "#303B45", strokeWidth: 2.5 }),
        $(go.Shape, { toArrow: "Standard", stroke: null })
      );
      this.diagramName=data.name
      myDiagram.model = $(go.GraphLinksModel, data.content);
    });
  },
  methods: {
    save: function() {
      if(!this.diagramName){
        this.$message.error("Diagram name cannot be null!");
        return;
      }
      this.$message.success("Save Success!");
      vscodeEvent.emit("save",{
        name:this.diagramName,
        data: this.myDiagram.model.toJson()
      });
    }
  }
};
</script>

<style>
</style>