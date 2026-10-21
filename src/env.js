/**
 * 运行环境判断工具
 */

/**
 * 是否 H5 运行环境
 * 包内不使用 uni-app 条件编译（node_modules 内行为不可靠），统一运行时判断
 * @returns {Boolean} 是否 H5 环境
 */
export const isH5 = () => typeof window !== 'undefined'
