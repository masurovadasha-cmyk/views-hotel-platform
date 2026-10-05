import {describe,expect,it} from "vitest";
import {csvCell,csvRows} from "./analytics-csv";

describe("analytics CSV safety",()=>{
  it("neutralizes spreadsheet formula prefixes",()=>{
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-danger")).toBe("'-danger");
    expect(csvCell("@payload")).toBe("'@payload");
  });

  it("quotes commas, quotes and line breaks",()=>{
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("renders deterministic CRLF CSV",()=>{
    const csv=csvRows(
      ["city","value"],
      [{city:"Tashkent",value:10},{city:"Samarkand",value:20}]
    );
    expect(csv).toBe(
      "city,value\r\nTashkent,10\r\nSamarkand,20\r\n"
    );
  });
});
