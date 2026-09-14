export const mockActions = {

  safeClick: {
    action: "click",
    target_id: "el_name",
    confidence: 0.90,
    metadata: {}
  },

  riskySubmitClick: {
    action: "click",
    target_id: "el_submit",
    confidence: 0.88,
    metadata: {}
  },

  riskyDeleteClick: {
    action: "click",
    target_id: "el_delete",
    confidence: 0.80,
    metadata: {}
  },

  passwordTyping: {
    action: "type",
    target_id: "el_new_password",
    confidence: 0.95,
    metadata: {
      value: "test"
    }
  },

  sensitiveOverrideClick: {
    action: "click",
    target_id: "el_password",
    confidence: 0.99,
    metadata: {}
  }
};