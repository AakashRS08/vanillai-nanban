package com.vanillai.nanban.security;

import java.util.UUID;

/** The authenticated principal placed in the SecurityContext by {@link JwtAuthFilter}. */
public record AuthUser(UUID id, String email) {}
