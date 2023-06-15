export class HttpClientError {
    constructor(
        readonly status: number,
        readonly message: string,
        readonly response: any,
    ) {}
}

export class HttpClient {

    constructor(
        /** Base API URL. */
        readonly baseUrl: string,
        /** Callback executed before an HTTP request is run. */
        private readonly onBeforeRequest?: () => void,
        /** Callback executed in a case of a failed HTTP request. */
        private readonly onError?: (error: any) => void,
    ) {}

    /**
     * Run an HTTP DELETE request to the given endpoint.
     * @param path Endpoint path, relative to the client's baseURl.
     * @param sessionToken Optional session token to set in the request header.
     * @param body Optional request body.
     * @param headers Optional additional headers.
     */
    delete<T>(path: string, sessionToken?: string, body?: any, headers?: { [k: string]: string }): Promise<T> {
        return this.request<T>('DELETE', path, body, sessionToken ? {'X-User-Session': sessionToken, ...headers} : headers);
    }

    /**
     * Run an HTTP GET request to the given endpoint.
     * @param path Endpoint path, relative to the client's baseURl.
     */
    get<T>(path: string): Promise<T> {
        return this.request<T>('GET', path);
    }

    /**
     * Run an HTTP POST request to the given endpoint.
     * @param path Endpoint path, relative to the client's baseURl.
     * @param sessionToken Optional session token to set in the request header.
     * @param body Optional request body.
     * @param headers Optional additional headers.
     */
    post<T>(path: string, sessionToken?: string, body?: any, headers?: { [k: string]: string }): Promise<T> {
        return this.request<T>('POST', path, body, sessionToken ? {'X-User-Session': sessionToken, ...headers} : headers);
    }

    /**
     * Run an HTTP PUT request to the given endpoint.
     * @param path Endpoint path, relative to the client's baseURl.
     * @param sessionToken Optional session token to set in the request header.
     * @param body Optional request body.
     * @param headers Optional additional headers.
     */
    put<T>(path: string, sessionToken?: string, body?: any, headers?: { [k: string]: string }): Promise<T> {
        return this.request<T>('PUT', path, body, sessionToken ? {'X-User-Session': sessionToken, ...headers} : headers);
    }

    /**
     * Convert the relative endpoint path to an absolute one by prepending it with the base URL.
     * @param path Relative endpoint path.
     */
    private getEndpointUrl(path: string): string {
        // Combine the two paths, making sure there's exactly one slash in between
        return this.baseUrl + (this.baseUrl.endsWith('/') ? '' : '/') + (path.startsWith('/') ? path.substring(1) : path);
    }

    private request<T>(method: 'DELETE' | 'GET' | 'POST' | 'PUT', path: string, body?: any, headers?: { [k: string]: string }): Promise<T> {
        // Run the before callback, if any
        this.onBeforeRequest?.();

        // Run the request
        return new Promise((resolve, reject) => {
            try {
                // Prepare an XMLHttpRequest
                const req = new XMLHttpRequest();
                req.open(method, this.getEndpointUrl(path), true);
                if (body) {
                    req.setRequestHeader('Content-type', 'application/json');
                }

                // Add necessary headers
                if (headers) {
                    Object.entries(headers).forEach(([k, v]) => req.setRequestHeader(k, v as string));
                }

                // Resolve or reject the promise on load, based on the return status
                const handleError = () => {
                    const e = new HttpClientError(req.status, req.statusText, req.response);
                    // Run the error callback, if any
                    this.onError?.(e);
                    // Reject the promise
                    reject(e);
                };

                // Set up the request callbacks
                req.onload = () => {
                    // Only statuses 200..299 are considered successful
                    if (req.status < 200 || req.status > 299) {
                        handleError();

                    // If there's any response available, parse it as JSON
                    } else if (req.response) {
                        resolve(JSON.parse(req.response));

                    // Resolve with an empty object otherwise
                    } else {
                        resolve(undefined as T);
                    }
                };
                req.onerror = handleError;

                // Run the request
                req.send(body ? JSON.stringify(body) : undefined);

            } catch (e) {
                // Run the error callback, if any
                this.onError?.(e);
                // Reject the promise on any failure
                reject(e);
            }
        });
    }
}
