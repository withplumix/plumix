declare const type: string;
declare const taxonomy: { readonly name: string };

export const create = "entry:media:create";
export const editAny = `entry:${type}:edit_any`;
export const restore = "entry:post:restore_revision";
export const manage = "term:menu:manage";
export const assign = `term:${taxonomy.name}:assign`;
