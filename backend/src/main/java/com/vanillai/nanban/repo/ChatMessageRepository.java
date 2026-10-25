package com.vanillai.nanban.repo;

import com.vanillai.nanban.model.ChatMessage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {
    List<ChatMessage> findByUserIdOrderBySentAtDesc(UUID userId, Pageable pageable);
}
