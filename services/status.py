from model import StatusUpdate

def make_status(status: str, task: str, message: str | None = None) -> StatusUpdate:
    return StatusUpdate(status=status, task=task, message=message)