/**
 * Identifiants partagés entre un onglet et son panneau.
 *
 * Dans leur propre module plutôt qu'exportés depuis `Tabs.tsx` : un fichier de composants
 * qui exporte aussi des fonctions casse le rafraîchissement à chaud. Exportés plutôt que
 * composés à la main de chaque côté : un `aria-controls` qui ne désigne rien est pire que
 * pas d'`aria-controls`, et rien dans le typage ne rattraperait deux conventions
 * divergentes.
 */
export function tabId(id: string) {
  return `tab-${id}`;
}

export function tabPanelId(id: string) {
  return `tabpanel-${id}`;
}
