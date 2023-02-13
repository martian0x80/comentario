package api

import "gitlab.com/comentario/comentario/internal/util"

var commentsRowColumns = `
	comments.commentHex,
	comments.commenterHex,
	comments.markdown,
	comments.html,
	comments.parentHex,
	comments.score,
	comments.state,
	comments.deleted,
	comments.creationDate
`

func commentsRowScan(s sqlScanner, c *comment) error {
	return s.Scan(
		&c.CommentHex,
		&c.CommenterHex,
		&c.Markdown,
		&c.Html,
		&c.ParentHex,
		&c.Score,
		&c.State,
		&c.Deleted,
		&c.CreationDate,
	)
}

func commentGetByCommentHex(commentHex string) (comment, error) {
	if commentHex == "" {
		return comment{}, util.ErrorMissingField
	}

	statement := `
		SELECT ` + commentsRowColumns + `
		FROM comments
		WHERE comments.commentHex = $1;
	`
	row := DB.QueryRow(statement, commentHex)

	var c comment
	if err := commentsRowScan(row, &c); err != nil {
		// TODO: is this the only error?
		return c, util.ErrorNoSuchComment
	}

	return c, nil
}
