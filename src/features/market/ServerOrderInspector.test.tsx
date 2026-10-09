import {describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {ServerOrderInspector} from "./ServerOrderInspector";

describe("Staff CRM server order inspector",()=>{
 it("renders a read-only, explicit lookup without automatic Core requests",()=>{
  const fetcher=vi.fn();
  vi.stubGlobal("fetch",fetcher);
  try{
   const html=renderToStaticMarkup(<ServerOrderInspector/>);
   expect(html).toContain("Карточка заказа Core");
   expect(html).toContain("Только просмотр");
   expect(html).toContain("UUID заказа");
   expect(html).toContain("Загрузить заказ");
   expect(fetcher).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals()}
 });
});
