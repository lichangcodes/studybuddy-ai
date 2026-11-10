// Build a URL for the current page with updated query params, keeping the rest intact.
export const setQueryParam = (params: string, key: string, value: string) => {
    const query = new URLSearchParams(params);
    query.set(key, value);
    return `${window.location.pathname}?${query.toString()}`;
}

export const removeQueryParams = (params: string, keys: string[]) => {
    const query = new URLSearchParams(params);
    keys.forEach((key) => query.delete(key));
    const queryString = query.toString();
    return queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
}
