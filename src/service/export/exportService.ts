import { ExportContext } from "./exportContext";

export interface ExportService {
    export(exportOption:ExportContext): void;
}