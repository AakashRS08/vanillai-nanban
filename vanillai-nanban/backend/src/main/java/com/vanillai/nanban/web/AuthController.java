package com.vanillai.nanban.web;

import com.vanillai.nanban.dto.Dtos.AuthResponse;
import com.vanillai.nanban.dto.Dtos.LoginRequest;
import com.vanillai.nanban.dto.Dtos.RegisterRequest;
import com.vanillai.nanban.dto.Dtos.UserDto;
import com.vanillai.nanban.model.User;
import com.vanillai.nanban.repo.UserRepository;
import com.vanillai.nanban.security.AdminPolicy;
import com.vanillai.nanban.security.AuthUser;
import com.vanillai.nanban.security.JwtService;
import jakarta.validation.Valid;
import java.util.Locale;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

/** User Management Module (report 5.2.1). */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final AdminPolicy admins;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt, AdminPolicy admins) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.admins = admins;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        User saved;
        try {
            saved = users.save(new User(req.name().trim(), email, encoder.encode(req.password())));
        } catch (DataIntegrityViolationException e) {   // lost a race with a concurrent signup
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(response(saved));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        User u = users.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        // One generic message for unknown email and wrong password: don't reveal which accounts exist.
        if (u == null || !encoder.matches(req.password(), u.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Incorrect email or password");
        }
        return response(u);
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal AuthUser auth) {
        User u = users.findById(auth.id()).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Account no longer exists"));
        return toDto(u);
    }

    private AuthResponse response(User u) {
        return new AuthResponse(jwt.issue(u), toDto(u));
    }

    private UserDto toDto(User u) {
        return new UserDto(u.getId(), u.getName(), u.getEmail(), admins.isAdmin(u.getEmail()));
    }
}
