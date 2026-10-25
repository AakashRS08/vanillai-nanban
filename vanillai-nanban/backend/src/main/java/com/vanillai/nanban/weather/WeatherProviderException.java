package com.vanillai.nanban.weather;

/** The external weather provider was unreachable or returned something unusable. */
public class WeatherProviderException extends RuntimeException {
    public WeatherProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}
