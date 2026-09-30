// wrangler compiles `.wasm` imports to WebAssembly.Module (module rule CompiledWasm).
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
