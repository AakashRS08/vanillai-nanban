package com.vanillai.nanban.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Table 8.5 - CHAT_HISTORY */
@Entity
@Table(name = "chat_history", indexes = @Index(columnList = "user_id,sent_at"))
public class ChatMessage {

    public static final String USER = "user";
    public static final String BOT = "bot";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt = Instant.now();

    @Column(nullable = false, length = 4000)
    private String message;

    /** 'user' or 'bot' */
    @Column(name = "sender_type", nullable = false, length = 10)
    private String senderType;

    protected ChatMessage() {}

    public ChatMessage(User user, String message, String senderType) {
        this.user = user;
        this.message = message;
        this.senderType = senderType;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public Instant getSentAt() { return sentAt; }
    public String getMessage() { return message; }
    public String getSenderType() { return senderType; }
}
