package com.vanillai.nanban.web;

import com.vanillai.nanban.chat.ChatService;
import com.vanillai.nanban.dto.Dtos.ChatLine;
import com.vanillai.nanban.dto.Dtos.ChatReply;
import com.vanillai.nanban.dto.Dtos.ChatRequest;
import com.vanillai.nanban.security.AuthUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chat;

    public ChatController(ChatService chat) {
        this.chat = chat;
    }

    /** Public, but signed-in users additionally get their conversation stored and remembered. */
    @PostMapping
    public ChatReply send(@AuthenticationPrincipal AuthUser auth, @Valid @RequestBody ChatRequest req) {
        return chat.reply(req, auth);
    }

    @GetMapping("/history")
    public List<ChatLine> history(@AuthenticationPrincipal AuthUser auth,
                                  @RequestParam(defaultValue = "30") int limit) {
        return chat.history(auth, limit);
    }
}
