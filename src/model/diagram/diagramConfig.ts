export interface DiagramConfig {
    name: string,
    id: string,
    gojsConfig: {
        copiesArrays: boolean,
        copiesArrayObjects: boolean,
        nodeDataArray: [],
        linkDataArray: []
    }
}