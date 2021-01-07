export interface DiagramConfig {
    name: string,
    uid: string,
    gojsConfig: {
        copiesArrays: boolean,
        copiesArrayObjects: boolean,
        nodeDataArray: [],
        linkDataArray: []
    }
}
