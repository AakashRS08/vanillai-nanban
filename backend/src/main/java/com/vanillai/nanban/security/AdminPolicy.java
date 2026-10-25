package com.vanillai.nanban.security;

import com.vanillai.nanban.config.NanbanProperties;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Who counts as an admin: the emails listed in NANBAN_ADMIN_EMAILS (no role column in USERS). */
@Component
public class AdminPolicy {

    private final Set<String> adminEmails;

    public AdminPolicy(NanbanProperties props) {
        this.adminEmails = props.adminEmails() == null ? Set.of()
                : props.adminEmails().stream().map(e -> e.trim().toLowerCase(Locale.ROOT))
                        .filter(e -> !e.isEmpty()).collect(Collectors.toSet());
    }

    public boolean isAdmin(String email) {
        return email != null && adminEmails.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
