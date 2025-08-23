// src/utils/networking.js
import fetch from 'node-fetch';

export const buildUrl = (host, paths = [], searchParams, protocol = 'https') => {
  const url = new URL(paths.join('/'), `${protocol}://${host}`);
  if (searchParams) {
    const params = new URLSearchParams(searchParams);
    url.search = params.toString();
  }
  return url;
};

export const makeRequest = async (url, options = {}, extraHeaders = {}) => {
  const requestOptions = {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    ...options,
  };

  let res;
  try {
    res = await fetch(url.href ?? url.toString(), requestOptions);
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err) };
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text();

  if (!res.ok) {
    return { ok: false, status: res.status, data, error: data?.message || res.statusText };
  }
  return { ok: true, status: res.status, data, error: null };
};
