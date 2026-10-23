export const docOnly = {
  validatorCompiler: (() => (data: unknown) => ({ value: data })) as never,
  serializerCompiler: (() => (data: unknown) => JSON.stringify(data)) as never,
}